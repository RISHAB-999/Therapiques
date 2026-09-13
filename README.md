# 🩺 Therapique - Mental Health, Telehealth & Psycho-Educational Platform

<p align="center">
  <img src="frontend/src/assets/logo.svg" alt="Therapique Logo" width="180" />
</p>

<p align="center">
  <strong>Therapique</strong> is a modern, comprehensive mental health and telehealth ecosystem connecting patients with licensed mental health professionals, featuring real-time WebRTC video consultations, a curated therapeutic book library, a coin rewards system, an interactive AI assistant, and dedicated Doctor & Admin management panels.
</p>

---

## 🌟 Key Platform Modules

### 1. 👤 Patient Portal & Telehealth
- **Specialist Discovery**: Browse verified psychologists, psychiatrists, CBT therapists, trauma specialists, and child counselors by specialty, experience, and fees.
- **Smart Appointment Scheduling**: Real-time slot booking with instant confirmation.
- **WebRTC Video Consultations**:
  - High-definition 1-on-1 peer-to-peer video & audio calls.
  - In-call live chat with real-time Socket.IO signaling.
  - In-call controls (mic/camera toggle, screen dock, call timer).
  - Post-session completion confirmation & digital receipt generation.
- **Therapique AI Assistant**: Smart interactive conversational guide recommending therapists, articles, and therapeutic literature based on user concerns.
- **Appointment & Order History**: Real-time tracking of upcoming sessions, past consultations, and book orders.

### 2. 📚 Curated Mental Health Library & E-Commerce
- **Therapeutic Book Catalog**: Extensive collection spanning CBT, Anxiety, Trauma Recovery, Addiction, Parenting, and Mindfulness.
- **Multi-Format Selection**: Support for Paperback, Hardcover, E-Book, and Audiobook editions.
- **Smooth Book Experience**: 3D tilt effects, page flip previews, and category-filtered browsing.
- **Cart & Order Tracking**: Instant checkout with automated invoice and receipt printing.
- **🪙 Coins & Rewards Wallet**: Earn reward coins with appointments and book purchases to redeem on future orders.

### 3. 📰 Psycho-Educational Blog & Resource Bento
- **Curated Articles**: Deep-dive clinical insights on anxiety management, burnout, trauma healing, and habit formation.
- **Integrated Specialist CTAs**: Direct routing from articles to relevant doctors and related library books.

### 4. 👨‍⚕️ Doctor Dashboard
- **Consultation Portal**: Direct access to join live video appointments with patients.
- **Schedule & Availability**: Manage active working hours, breaks, and consultation slots.
- **Patient Case Records**: View patient history, consultation notes, and completed session logs.
- **Earnings & Analytics**: Track completed sessions, pending fees, and monthly revenue.

### 5. 🔐 Admin Management Panel
- **Doctor Verification & Onboarding**: Add, review credentials, and publish doctor profiles.
- **Appointment Oversight**: Comprehensive dashboard monitoring all platform sessions in real time.
- **Refund & Order Management**: Process patient cancellations, order refunds, and platform transactions.
- **System Analytics**: Platform-wide metrics for user growth, appointments, and sales.

---

## 🛠️ Tech Stack

| Domain | Technologies |
|---|---|
| **Frontend (Patient)** | React 18, Vite, Tailwind CSS, Lucide Icons, Canvas Confetti |
| **Admin & Doctor Panel** | React 18, Vite, Tailwind CSS, Context API |
| **Backend API** | Node.js, Express.js, MongoDB, Mongoose |
| **Real-time & Video** | Socket.IO, WebRTC (Peer-to-Peer with STUN/TURN support) |
| **Authentication** | JWT (JSON Web Tokens), bcryptjs |
| **Payment Gateways** | Razorpay & Stripe |
| **Cloud Storage** | Cloudinary (Doctor photos, Book covers, Medical documents) |

---

## 📁 Repository Structure

```
Therapique/
├── frontend/             # Patient-facing React application (Port 5173)
│   ├── src/
│   │   ├── assets/       # Illustrations, icons, book covers & doctor images
│   │   ├── components/   # UI components (Navbar, VideoCall, Assistant, etc.)
│   │   ├── context/      # AppContext, ShopContext
│   │   ├── hooks/        # useWebRTC, useSocket, useCallSignaling
│   │   └── pages/        # Home, Library, Appointments, VideoCallPage, Blog
├── admin/                # Admin & Doctor Dashboard React application (Port 5174)
│   ├── src/
│   │   ├── context/      # AdminContext, DoctorContext
│   │   └── pages/        # Doctor Appointments, Dashboard, AddDoctor
├── backend/              # Node.js/Express API Server (Port 4000)
│   ├── config/           # MongoDB & Cloudinary configuration
│   ├── controllers/      # Admin, Doctor, User & Payment controllers
│   ├── models/           # Appointment, Doctor, User, Book schemas
│   ├── routes/           # REST API route definitions
│   └── socket/           # WebRTC signaling & real-time chat handlers
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local MongoDB instance or MongoDB Atlas URI
- **Cloudinary Account**: For cloud image storage
- **Stripe & Razorpay API Keys**: For payment testing

---

### Installation & Setup

#### 1. Clone the Repository
```bash
git clone https://github.com/RISHAB-999/Therapiques.git
cd Therapique
```

#### 2. Configure Backend
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:
```env
PORT=4000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_SECRET_KEY=your_cloudinary_secret_key
ADMIN_EMAIL=admin@therapique.com
ADMIN_PASSWORD=your_admin_password
STRIPE_SECRET_KEY=your_stripe_secret_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
CURRENCY=INR
```

#### 3. Configure Frontend
```bash
cd ../frontend
npm install
```

Create a `.env` file in the `frontend/` directory:
```env
VITE_BACKEND_URL=http://localhost:4000
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key
```

#### 4. Configure Admin Panel
```bash
cd ../admin
npm install
```

Create a `.env` file in the `admin/` directory:
```env
VITE_BACKEND_URL=http://localhost:4000
```

---

### Running Locally

You can launch each service in its own terminal window:

```bash
# 1. Start Backend API & Socket Server (Port 4000)
cd backend
npm start

# 2. Start Frontend Application (Port 5173)
cd frontend
npm run dev

# 3. Start Admin / Doctor Panel (Port 5174)
cd admin
npm run dev
```

---

## 🔗 API Overview

| Route | Method | Description |
|---|---|---|
| `/api/user/register` | `POST` | Patient registration |
| `/api/user/login` | `POST` | Patient login |
| `/api/user/book-appointment` | `POST` | Book a consultation slot |
| `/api/user/appointments` | `GET` | Retrieve user appointment history |
| `/api/user/payment-razorpay` | `POST` | Initiate Razorpay checkout |
| `/api/user/payment-stripe` | `POST` | Initiate Stripe checkout |
| `/api/doctor/login` | `POST` | Doctor authentication |
| `/api/doctor/appointments` | `GET` | List assigned doctor appointments |
| `/api/doctor/complete-appointment` | `POST` | Mark session as completed |
| `/api/admin/add-doctor` | `POST` | Register & verify new doctor |
| `/api/admin/all-appointments` | `GET` | Platform-wide appointment monitoring |

---

## 🔒 Security Best Practices
- Strict environment variable separation (`.env` files are ignored from version control).
- Passwords salted and hashed with `bcryptjs`.
- Role-based authorization middleware for `User`, `Doctor`, and `Admin` routes.
- WebRTC peer connections secured over WebSockets with token authentication.

---

## 👥 Authors & Contributions

Developed by **RISHAB-999**
- GitHub: [@RISHAB-999](https://github.com/RISHAB-999)
- Repository: [Therapiques](https://github.com/RISHAB-999/Therapiques.git)
