import React, { useContext, useState, useEffect, useRef } from 'react'
import { AppContext } from '../context/AppContext'
import { toast } from 'react-toastify'
import axios from 'axios'
import ImageCropperModal from '../components/ImageCropperModal'
import CustomDropdown from '../components/ui/CustomDropdown'
import DateInput from '../components/ui/DateInput'
import { ChevronDown, X, Lock, KeyRound, Eye, EyeOff } from 'lucide-react'

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

const THERAPY_GOALS_LIST = [
  'Not Specified',
  'Managing emotions',
  'Building healthier habits',
  'Improving relationships',
  'Coping with stress',
  'Personal growth',
  'Better understanding myself'
]

const SUPPORT_AREAS_LIST = [
  'Anxiety',
  'Stress',
  'Sleep',
  'Relationships',
  'Career',
  'Personal Growth',
  'Other'
]

const MyProfile = () => {
    const { token, backendUrl, userData, setUserData, loadUserProfileData } = useContext(AppContext)
    const [isEdit, setIsEdit] = useState(false)
    const [image, setImage] = useState(false)
    const [rawImgFile, setRawImgFile] = useState(null)
    const [showCropper, setShowCropper] = useState(false)

    // Phone Country selector state
    const [selectedCountry, setSelectedCountry] = useState(COUNTRY_LIST[0])
    const [phoneDigits, setPhoneDigits] = useState('')
    const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
    const countryDropdownRef = useRef(null)

    const [savedAddresses, setSavedAddresses] = useState([])

    // Password Change State
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showCurrentPass, setShowCurrentPass] = useState(false)
    const [showNewPass, setShowNewPass] = useState(false)
    const [showConfirmPass, setShowConfirmPass] = useState(false)
    const [passwordLoading, setPasswordLoading] = useState(false)

    const handleChangePassword = async (e) => {
        e.preventDefault()
        if (!currentPassword || !newPassword || !confirmPassword) {
            return toast.error('Please fill in all password fields')
        }
        if (newPassword.length < 8) {
            return toast.error('New password must be at least 8 characters long')
        }
        if (newPassword !== confirmPassword) {
            return toast.error('New passwords do not match')
        }

        try {
            setPasswordLoading(true)
            const { data } = await axios.post(
                `${backendUrl}/api/user/change-password`,
                { currentPassword, newPassword },
                { headers: { token } }
            )

            if (data.success) {
                toast.success(data.message || 'Password updated successfully!')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                setShowPasswordModal(false)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.error('Password change error:', error)
            toast.error(error.response?.data?.message || error.message || 'Failed to update password')
        } finally {
            setPasswordLoading(false)
        }
    }

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

    // Pre-populate phone country and digits from userData.phone
    useEffect(() => {
        if (userData) {
            const rawPhone = String(userData.phone || '').trim()
            if (rawPhone && rawPhone !== '000000000000') {
                const matched = COUNTRY_LIST.find((c) => rawPhone.startsWith(c.dial_code))
                if (matched) {
                    setSelectedCountry(matched)
                    setPhoneDigits(rawPhone.slice(matched.dial_code.length).replace(/\D/g, ''))
                } else {
                    setPhoneDigits(rawPhone.replace(/\D/g, ''))
                }
            } else {
                setPhoneDigits('')
            }
        }
    }, [userData])

    const toggleSupportArea = (area) => {
        setUserData(prev => {
            const current = Array.isArray(prev?.supportAreas) ? [...prev.supportAreas] : []
            const exists = current.includes(area)
            const updated = exists ? current.filter(a => a !== area) : [...current, area]
            return { ...prev, supportAreas: updated }
        })
    }

    useEffect(() => {
        if (!userData) {
            setSavedAddresses([])
            return
        }

        let list = []
        // 1. Try to load user-scoped saved addresses from localStorage
        if (userData._id) {
            try {
                const stored = localStorage.getItem(`saved_addresses_${userData._id}`)
                if (stored) list = JSON.parse(stored)
            } catch (e) {}
        }

        // 2. If none in local storage, check if user has address in database
        if (!list || list.length === 0) {
            let userAddr = userData.address || {}
            if (typeof userAddr === 'string') {
                try { userAddr = JSON.parse(userAddr) } catch (e) {}
            }

            const hasValidDbAddress = userAddr && (userAddr.street || userAddr.line1 || userAddr.city || userAddr.line2)
            if (hasValidDbAddress) {
                list = [
                    {
                        type: userAddr.type || 'Home',
                        street: userAddr.street || userAddr.line1 || '',
                        city: userAddr.city || userAddr.line2 || '',
                        state: userAddr.state || '',
                        country: userAddr.country || 'India',
                        zipcode: userAddr.zipcode || ''
                    }
                ]
            } else {
                // Brand new user with no address yet: initialize clean blank slot
                list = [
                    {
                        type: 'Home',
                        street: '',
                        city: '',
                        state: '',
                        country: 'India',
                        zipcode: ''
                    }
                ]
            }
        }

        list = list.map((a, idx) => ({
            ...a,
            type: a.type || (idx === 0 ? 'Home' : 'Office')
        })).slice(0, 2)

        setSavedAddresses(list)
    }, [userData])

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setRawImgFile(e.target.files[0])
            setShowCropper(true)
            e.target.value = ''
        }
    }

    const handleCropComplete = (croppedFile) => {
        setImage(croppedFile)
        setShowCropper(false)
        setIsEdit(true)
    }

    const handleAddressChange = (index, field, value) => {
        setSavedAddresses(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: value }
            return updated
        })
    }

    // Function to update user profile data using API
    const updateUserProfileData = async () => {
        try {
            const formData = new FormData();

            const formattedPhone = phoneDigits ? `${selectedCountry.dial_code} ${phoneDigits}` : ''

            formData.append('name', userData.name || '')
            formData.append('phone', formattedPhone)
            formData.append('address', JSON.stringify(savedAddresses[0] || userData.address || {}))
            formData.append('gender', userData.gender || 'Not Selected')
            formData.append('dob', userData.dob || '')
            if (userData.wellnessGoal !== undefined) {
                formData.append('wellnessGoal', userData.wellnessGoal || '')
            }
            if (userData.supportAreas !== undefined) {
                formData.append('supportAreas', JSON.stringify(userData.supportAreas || []))
            }
            if (userData.therapyPreference !== undefined) {
                formData.append('therapyPreference', userData.therapyPreference || '')
            }
            if (image) {
                formData.append('image', image)
            }

            if (userData?._id) {
                localStorage.setItem(`saved_addresses_${userData._id}`, JSON.stringify(savedAddresses))
            }
            localStorage.removeItem('saved_addresses')

            const { data } = await axios.post(backendUrl + '/api/user/update-profile', formData, { headers: { token } })

            if (data.success) {
                toast.success("Profile & saved addresses updated successfully!")
                await loadUserProfileData()
                setIsEdit(false)
                setImage(false)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    if (!userData) {
        return (
            <div className='min-h-[75vh] flex flex-col items-center justify-center gap-4 py-16 text-center max-padd-container'>
                <div className='w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-2' />
                <h3 className='text-xl font-bold text-gray-800'>Loading your profile...</h3>
                <p className='text-sm text-gray-500 max-w-sm'>If you are not logged in, please log in to view your personal profile and address settings.</p>
                <div className='flex gap-4 mt-2'>
                    <button
                        onClick={() => window.location.href = '/login'}
                        className='bg-black text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-gray-800 transition cursor-pointer'
                    >
                        Go to Login
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className='bg-[#F3E8DE] text-gray-700 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#EADBCE] transition cursor-pointer'
                    >
                        Refresh Page
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className='min-h-screen py-6 sm:py-8 w-full max-w-5xl mx-auto overflow-x-hidden'>
            {/* Header */}
            <div className='text-center mb-6 sm:mb-8 px-2'>
                <h1 className='font-therapique text-2xl sm:text-3xl md:text-4xl text-gray-900 mb-2'>
                    <span className='font-bold'>My</span>{' '}
                    <span className='font-normal underline decoration-gray-400 underline-offset-4'>Profile</span>
                </h1>
                <p className='text-gray-600 text-xs sm:text-sm md:text-base font-medium'>Manage your personal information and saved shipping addresses</p>
            </div>

            <div className='rounded-3xl shadow-[0_8px_30px_rgba(70,56,48,0.06)] p-3.5 sm:p-8 md:p-10 bg-[#FAF5EE] border border-[#EADBCE] w-full max-w-full overflow-hidden'>
                {/* Profile Image Section */}
                <div className='flex flex-col items-center justify-center gap-3 sm:gap-4 mb-6 sm:mb-8'>
                    <div className="relative group w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48">
                        <label 
                            htmlFor='image' 
                            className='w-full h-full rounded-3xl overflow-hidden border-4 border-[#FDF7F3] shadow-lg bg-[#F3E8DE] flex items-center justify-center relative cursor-pointer block'
                        >
                            <img 
                                className='w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105' 
                                src={image ? URL.createObjectURL(image) : userData.image} 
                                alt="Profile" 
                            />
                            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity p-4 text-center">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-black text-white flex items-center justify-center mb-1.5 shadow-md group-hover:scale-110 transition-transform">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <span className="text-[11px] font-extrabold tracking-wide">Change Photo</span>
                            </div>
                        </label>
                        <input onChange={handleFileSelect} type="file" id="image" accept="image/*" hidden />
                    </div>

                    <label htmlFor='image' className='inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold bg-[#F3E8DE] text-gray-800 border border-[#EADBCE] hover:bg-[#EADBCE] transition-all cursor-pointer shadow-2xs text-center'>
                        <span>Change & Crop Profile Picture</span>
                    </label>
                </div>

                {/* Name Section */}
                <div className='text-center mb-6 sm:mb-8 px-2'>
                    {isEdit ? (
                        <input 
                            className='text-xl sm:text-3xl md:text-4xl font-bold text-gray-900 text-center bg-[#FDF7F3] border-b-2 border-purple-400 focus:border-purple-600 outline-none transition-colors duration-300 w-full max-w-xs sm:max-w-md p-1.5 sm:p-2 rounded-t-xl' 
                            type="text" 
                            onChange={(e) => setUserData(prev => ({ ...prev, name: e.target.value }))} 
                            value={userData.name || ''} 
                            placeholder="Enter your name"
                        />
                    ) : (
                        <h2 className='text-xl sm:text-3xl md:text-4xl font-bold text-gray-900 break-words'>{userData.name}</h2>
                    )}
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 items-start w-full max-w-full'>
                    {/* Contact Information & Both Saved Addresses */}
                    <div className='bg-[#FDF7F3] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 md:p-6 border border-[#EADBCE] space-y-4 sm:space-y-5 shadow-xs w-full max-w-full overflow-hidden'>
                        <h3 className='text-base sm:text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2 border-b border-[#EADBCE] pb-3'>
                            <span className='w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#F3E8DE] text-gray-800 flexCenter text-xs sm:text-sm shrink-0'>📞</span>
                            <span className='truncate'>Contact & Shipping Addresses</span>
                        </h3>
                        
                        <div className='space-y-3.5 sm:space-y-4'>
                            <div>
                                <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1'>Email Address</label>
                                <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] overflow-hidden'>
                                    <p className='text-purple-700 font-bold text-xs sm:text-sm truncate'>{userData.email}</p>
                                </div>
                            </div>

                            <div>
                                <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1.5'>Phone Number</label>
                                {isEdit ? (
                                    <div className="relative flex items-center gap-1.5 sm:gap-2">
                                        {/* Country Flag Dropdown Button */}
                                        <div className="relative shrink-0" ref={countryDropdownRef}>
                                            <button
                                                type="button"
                                                onClick={() => setIsCountryDropdownOpen((prev) => !prev)}
                                                className="h-10 px-2 sm:px-2.5 bg-[#FAF5EE] border border-[#EADBCE] hover:border-black rounded-xl text-xs font-semibold text-gray-800 flex items-center gap-1 sm:gap-1.5 shrink-0 transition-all cursor-pointer shadow-2xs"
                                                title="Select country code"
                                            >
                                                <span className="text-base sm:text-lg leading-none">{selectedCountry.flag}</span>
                                                <span className="hidden sm:inline text-xs font-bold text-gray-700">{selectedCountry.name}</span>
                                                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>

                                            {/* Dropdown Menu */}
                                            {isCountryDropdownOpen && (
                                                <div className="absolute left-0 top-full mt-1.5 w-60 max-h-56 bg-white border border-[#EADBCE] rounded-2xl shadow-xl z-50 overflow-y-auto p-1.5 space-y-0.5">
                                                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase text-gray-400">Select Country</div>
                                                    {COUNTRY_LIST.map((country) => (
                                                        <button
                                                            key={country.code}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedCountry(country)
                                                                setIsCountryDropdownOpen(false)
                                                                setUserData(prev => ({
                                                                    ...prev,
                                                                    phone: phoneDigits ? `${country.dial_code} ${phoneDigits}` : ''
                                                                }))
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
                                        <div className="h-10 px-2 sm:px-2.5 bg-[#FAF5EE] border border-[#EADBCE] rounded-xl text-xs font-bold text-gray-700 flex items-center justify-center shrink-0 select-none shadow-2xs">
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
                                                    setUserData(prev => ({
                                                        ...prev,
                                                        phone: rawDigits ? `${selectedCountry.dial_code} ${rawDigits}` : ''
                                                    }))
                                                }}
                                                placeholder={selectedCountry.placeholder}
                                                className="w-full h-10 px-3 pr-7 bg-[#FAF5EE] border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                                            />
                                            {phoneDigits && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPhoneDigits('')
                                                        setUserData(prev => ({ ...prev, phone: '' }))
                                                    }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors cursor-pointer"
                                                    title="Clear phone number"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] text-xs sm:text-sm font-medium'>
                                        <p className={userData.phone && userData.phone !== '000000000000' ? 'text-gray-900 flex items-center gap-2' : 'text-gray-400 italic'}>
                                            {userData.phone && userData.phone !== '000000000000' ? (
                                                <>
                                                    <span className="text-base leading-none">{selectedCountry?.flag || '📞'}</span>
                                                    <span>{userData.phone}</span>
                                                </>
                                            ) : (
                                                'Not Specified'
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Saved Shipping Addresses Section */}
                            <div className='space-y-3 pt-2'>
                                <div className='flex items-center justify-between gap-2'>
                                    <label className='text-[11px] sm:text-xs font-black uppercase tracking-wider text-gray-800 block'>
                                        Saved Delivery Addresses ({savedAddresses.length}/2)
                                    </label>
                                    <span className='text-[10px] font-bold text-gray-400 shrink-0'>Max 2 Addresses</span>
                                </div>

                                {savedAddresses.map((addr, index) => (
                                    <div key={index} className='bg-[#FAF5EE] p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#EADBCE] space-y-2 relative w-full max-w-full overflow-hidden'>
                                        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-[#EADBCE] pb-2'>
                                            {isEdit ? (
                                                <div className='flex flex-wrap items-center gap-1 sm:gap-1.5'>
                                                    {['Home', 'Office', 'Other'].map((t) => {
                                                        const isSelected = (addr.type || (index === 0 ? 'Home' : 'Office')) === t;
                                                        return (
                                                            <button
                                                                key={t}
                                                                type='button'
                                                                onClick={() => handleAddressChange(index, 'type', t)}
                                                                className={`px-2.5 sm:px-3 py-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-extrabold transition-all duration-200 cursor-pointer flex items-center gap-1 border ${
                                                                    isSelected
                                                                        ? 'bg-black text-white border-black shadow-xs'
                                                                        : 'bg-[#FDF7F3] text-gray-700 border-[#EADBCE] hover:bg-[#F3E8DE]'
                                                                }`}
                                                            >
                                                                <span>{t === 'Office' ? '🏢' : t === 'Other' ? '📍' : '🏠'}</span>
                                                                <span>{t}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <span className='text-[11px] sm:text-xs font-bold text-gray-800 bg-[#F3E8DE] border border-[#EADBCE] px-2 sm:px-2.5 py-1 rounded-lg flex items-center gap-1.5'>
                                                    {addr.type === 'Office' ? '🏢 Office Address' : addr.type === 'Other' ? '📍 Other Address' : '🏠 Home Address'}
                                                </span>
                                            )}
                                            <span className='text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0'>
                                                Address #{index + 1}
                                            </span>
                                        </div>

                                        {isEdit ? (
                                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 w-full'>
                                                <input 
                                                    className='w-full bg-[#FDF7F3] rounded-lg p-2 sm:p-2.5 border border-[#EADBCE] text-xs font-medium focus:bg-white outline-none focus:border-purple-500' 
                                                    type="text" 
                                                    onChange={(e) => handleAddressChange(index, 'street', e.target.value)} 
                                                    value={addr.street || addr.line1 || ''} 
                                                    placeholder="Street / House No."
                                                />
                                                <input 
                                                    className='w-full bg-[#FDF7F3] rounded-lg p-2 sm:p-2.5 border border-[#EADBCE] text-xs font-medium focus:bg-white outline-none focus:border-purple-500' 
                                                    type="text" 
                                                    onChange={(e) => handleAddressChange(index, 'city', e.target.value)} 
                                                    value={addr.city || addr.line2 || ''} 
                                                    placeholder="City"
                                                />
                                                <input 
                                                    className='w-full bg-[#FDF7F3] rounded-lg p-2 sm:p-2.5 border border-[#EADBCE] text-xs font-medium focus:bg-white outline-none focus:border-purple-500' 
                                                    type="text" 
                                                    onChange={(e) => handleAddressChange(index, 'state', e.target.value)} 
                                                    value={addr.state || ''} 
                                                    placeholder="State"
                                                />
                                                <input 
                                                    className='w-full bg-[#FDF7F3] rounded-lg p-2 sm:p-2.5 border border-[#EADBCE] text-xs font-medium focus:bg-white outline-none focus:border-purple-500' 
                                                    type="text" 
                                                    onChange={(e) => handleAddressChange(index, 'country', e.target.value)} 
                                                    value={addr.country || ''} 
                                                    placeholder="Country"
                                                />
                                            </div>
                                        ) : (
                                            (addr.street || addr.line1 || addr.city || addr.line2) ? (
                                                <div className='space-y-1 text-xs text-gray-700 font-medium pt-0.5 break-words'>
                                                    <p className='font-bold text-gray-900 leading-relaxed'>
                                                        {addr.street || addr.line1}
                                                    </p>
                                                    <p className='text-gray-500'>
                                                        {[addr.city, addr.state, addr.country, addr.zipcode].filter(Boolean).join(', ')}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className='space-y-1 text-xs text-gray-400 italic pt-0.5'>
                                                    <p>No address saved yet. Click &quot;Edit Profile&quot; below to add your delivery address.</p>
                                                </div>
                                            )
                                        )}
                                    </div>
                                ))}

                                {isEdit && savedAddresses.length < 2 && (
                                    <button
                                        type='button'
                                        onClick={() => setSavedAddresses(prev => [...prev, { type: 'Office', street: '', city: '', state: '', country: 'India', zipcode: '' }])}
                                        className='w-full py-2.5 rounded-xl border border-dashed border-[#EADBCE] text-xs font-bold text-gray-700 hover:bg-[#F3E8DE] transition cursor-pointer mt-2 flex items-center justify-center gap-1.5'
                                    >
                                        <span>+</span>
                                        <span>Add Second Address (Max 2)</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Basic Information */}
                    <div className='bg-[#FDF7F3] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 md:p-6 border border-[#EADBCE] space-y-4 sm:space-y-5 shadow-xs w-full max-w-full overflow-visible relative z-20'>
                        <h3 className='text-base sm:text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2 border-b border-[#EADBCE] pb-3'>
                            <span className='w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#F3E8DE] text-gray-800 flexCenter text-xs sm:text-sm shrink-0'>👤</span>
                            <span className='truncate'>Basic Information</span>
                        </h3>
                        
                        <div className='space-y-3.5 sm:space-y-4'>
                            <div>
                                <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1'>Gender</label>
                                {isEdit ? (
                                    <CustomDropdown
                                        value={userData.gender || 'Not Selected'}
                                        onChange={(val) => setUserData(prev => ({ ...prev, gender: val }))}
                                        options={['Not Selected', 'Male', 'Female']}
                                        minWidth="w-full"
                                    />
                                ) : (
                                    <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] text-xs sm:text-sm font-medium text-gray-900'>
                                        <p>{userData.gender || 'Not Specified'}</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1'>Date of Birth</label>
                                {isEdit ? (
                                    <DateInput
                                        value={userData.dob || ''}
                                        onChange={(e) => setUserData(prev => ({ ...prev, dob: e.target.value }))}
                                        onClear={() => setUserData(prev => ({ ...prev, dob: '' }))}
                                        className="w-full"
                                    />
                                ) : (
                                    <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] text-xs sm:text-sm font-medium text-gray-900'>
                                        <p>{userData.dob || 'Not Specified'}</p>
                                    </div>
                                )}
                            </div>

                            {/* Wellness & Therapy Goals */}
                            <div className='pt-2 border-t border-[#EADBCE] space-y-3.5'>
                                <div>
                                    <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1'>Primary Wellness Goal</label>
                                    {isEdit ? (
                                        <CustomDropdown
                                            value={userData.wellnessGoal || 'Not Specified'}
                                            onChange={(val) => setUserData(prev => ({ ...prev, wellnessGoal: val === 'Not Specified' ? '' : val }))}
                                            options={THERAPY_GOALS_LIST}
                                            minWidth="w-full"
                                        />
                                    ) : (
                                        <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] text-xs sm:text-sm font-medium text-gray-900'>
                                            <p className={userData.wellnessGoal ? 'text-gray-900' : 'text-gray-400 italic'}>
                                                {userData.wellnessGoal || 'Not Specified'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1'>Therapy Preference</label>
                                    {isEdit ? (
                                        <CustomDropdown
                                            value={userData.therapyPreference || 'Not Selected'}
                                            onChange={(val) => setUserData(prev => ({ ...prev, therapyPreference: val }))}
                                            options={['Not Selected', 'Individual', 'Couples', 'Teen', 'Family']}
                                            minWidth="w-full"
                                        />
                                    ) : (
                                        <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] text-xs sm:text-sm font-medium text-gray-900'>
                                            <p className={userData.therapyPreference ? 'text-gray-900' : 'text-gray-400 italic'}>
                                                {userData.therapyPreference || 'Not Specified'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className='text-[10px] sm:text-xs font-extrabold uppercase text-gray-500 block mb-1'>
                                        Support Areas {isEdit && <span className="font-normal text-gray-400 lowercase">(click to select/remove)</span>}
                                    </label>
                                    {isEdit ? (
                                        <div className='flex flex-wrap gap-1.5 pt-1'>
                                            {SUPPORT_AREAS_LIST.map((area) => {
                                                const isSelected = Array.isArray(userData.supportAreas) && userData.supportAreas.includes(area)
                                                return (
                                                    <button
                                                        key={area}
                                                        type='button'
                                                        onClick={() => toggleSupportArea(area)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
                                                            isSelected
                                                                ? 'bg-black text-white border-black shadow-xs scale-105'
                                                                : 'bg-[#FAF5EE] text-gray-700 border-[#EADBCE] hover:bg-white hover:border-gray-400'
                                                        }`}
                                                    >
                                                        {isSelected && <span className="text-white text-xs font-black">✓</span>}
                                                        <span>{area}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        Array.isArray(userData.supportAreas) && userData.supportAreas.length > 0 ? (
                                            <div className='flex flex-wrap gap-1.5 pt-0.5'>
                                                {userData.supportAreas.map((area, idx) => (
                                                    <span key={idx} className='bg-[#FAF5EE] text-gray-800 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#EADBCE]'>
                                                        {area}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className='bg-[#FAF5EE] rounded-xl p-2.5 sm:p-3 border border-[#EADBCE] text-xs sm:text-sm font-medium text-gray-400 italic'>
                                                Not Specified
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Edit / Save Action Buttons */}
                <div className='mt-8 sm:mt-10 flex flex-wrap justify-center gap-3 sm:gap-4 w-full'>
                    {isEdit ? (
                        <>
                            <button 
                                onClick={updateUserProfileData} 
                                className='bg-black hover:bg-gray-800 text-white font-extrabold px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm transition-all duration-300 shadow-md cursor-pointer'
                            >
                                Save Changes
                            </button>
                            <button 
                                onClick={() => setIsEdit(false)} 
                                className='bg-[#F3E8DE] hover:bg-[#EADBCE] text-gray-800 font-bold px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm transition-all duration-300 cursor-pointer'
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button 
                                onClick={() => setIsEdit(true)} 
                                className='bg-black hover:bg-gray-800 text-white font-extrabold px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm transition-all duration-300 shadow-md cursor-pointer'
                            >
                                Edit Profile
                            </button>
                            <button 
                                onClick={() => setShowPasswordModal(true)} 
                                className='bg-[#FAF5EE] hover:bg-white text-gray-800 font-bold px-5 sm:px-7 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm border border-[#EADBCE] transition-all duration-300 shadow-2xs hover:border-black cursor-pointer flex items-center gap-2'
                            >
                                <KeyRound className="w-4 h-4 text-gray-700" />
                                <span>Change Password</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Change Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-50">
                    <div className="bg-white border border-[#EADBCE] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
                        <div className="flex items-center justify-between pb-3 border-b border-[#EADBCE]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-2xl bg-[#FAF5EE] border border-[#EADBCE] flex items-center justify-center text-black">
                                    <Lock className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Change Password</h3>
                                    <p className="text-[11px] text-gray-500">Update your account login password</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowPasswordModal(false)
                                    setCurrentPassword('')
                                    setNewPassword('')
                                    setConfirmPassword('')
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-[#FAF5EE] rounded-xl transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleChangePassword} className="space-y-4">
                            {/* Current Password */}
                            <div>
                                <label className="text-xs font-semibold text-gray-700 block mb-1">
                                    Current Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        type={showCurrentPass ? 'text' : 'password'}
                                        required
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Enter current password"
                                        className="w-full h-10 px-3.5 pr-10 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                                        className="absolute right-3 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                                    >
                                        {showCurrentPass ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* New Password */}
                            <div>
                                <label className="text-xs font-semibold text-gray-700 block mb-1">
                                    New Password <span className="text-red-500">*</span> (min 8 characters)
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        type={showNewPass ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter new strong password"
                                        className="w-full h-10 px-3.5 pr-10 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPass(!showNewPass)}
                                        className="absolute right-3 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                                    >
                                        {showNewPass ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="text-xs font-semibold text-gray-700 block mb-1">
                                    Confirm New Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        type={showConfirmPass ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Re-enter new password"
                                        className="w-full h-10 px-3.5 pr-10 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                                        className="absolute right-3 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                                    >
                                        {showConfirmPass ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EADBCE]">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPasswordModal(false)
                                        setCurrentPassword('')
                                        setNewPassword('')
                                        setConfirmPassword('')
                                    }}
                                    className="px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-[#FAF5EE] transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={passwordLoading}
                                    className="bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-2"
                                >
                                    {passwordLoading ? 'Updating...' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Image Cropper Modal */}
            <ImageCropperModal
                isOpen={showCropper}
                imageFile={rawImgFile}
                onCropComplete={handleCropComplete}
                onClose={() => setShowCropper(false)}
            />
        </div>
    )
}

export default MyProfile
