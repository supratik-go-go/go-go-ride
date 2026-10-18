import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AdminLayout, AppLayout, AuthLayout, PublicLayout, ScrollToTop } from './layouts/Layouts'
import { GuestOnly, RequireAuth, RequireRole } from './layouts/guards'
import { LoadingSpinner } from './components/ui/LoadingSpinner'

// Every page is code-split so the first load (and the Android app start) stays small.
const p = (loader) => lazy(loader)

// public website
const Landing = p(() => import('./pages/public/Landing'))
const About = p(() => import('./pages/public/About'))
const Contact = p(() => import('./pages/public/Contact'))
const NotFound = p(() => import('./pages/public/NotFound'))

// auth
const Login = p(() => import('./pages/auth/Login'))
const Register = p(() => import('./pages/auth/Register'))
const AdminLogin = p(() => import('./pages/auth/AdminLogin'))

// passenger app
const Home = p(() => import('./pages/passenger/Home'))
const SearchResults = p(() => import('./pages/passenger/SearchResults'))
const BusDetails = p(() => import('./pages/passenger/BusDetails'))
const SetAlarm = p(() => import('./pages/passenger/SetAlarm'))
const LiveTracking = p(() => import('./pages/passenger/LiveTracking'))
const NearbyStops = p(() => import('./pages/passenger/NearbyStops'))
const StopDetails = p(() => import('./pages/passenger/StopDetails'))
const RoutesList = p(() => import('./pages/passenger/RoutesList'))
const RouteDetails = p(() => import('./pages/passenger/RouteDetails'))
const RunningCar = p(() => import('./pages/passenger/RunningCar'))
const LocalCars = p(() => import('./pages/passenger/LocalCars'))
const LocalCarDetails = p(() => import('./pages/passenger/LocalCarDetails'))

// signed-in account area
const Profile = p(() => import('./pages/account/Profile'))
const EditProfile = p(() => import('./pages/account/EditProfile'))
const Bookings = p(() => import('./pages/account/Bookings'))
const BookingDetails = p(() => import('./pages/account/BookingDetails'))
const Alarms = p(() => import('./pages/account/Alarms'))
const Favorites = p(() => import('./pages/account/Favorites'))
const RecentSearches = p(() => import('./pages/account/RecentSearches'))
const Support = p(() => import('./pages/account/Support'))
const Settings = p(() => import('./pages/account/Settings'))
const Notifications = p(() => import('./pages/account/Notifications'))

// bus owner + driver
const MyBuses = p(() => import('./pages/owner/MyBuses'))
const BusForm = p(() => import('./pages/owner/BusForm'))
const MyCars = p(() => import('./pages/owner/MyCars'))

// admin
const Dashboard = p(() => import('./pages/admin/Dashboard'))
const AdminBuses = p(() => import('./pages/admin/Buses'))
const BusRequests = p(() => import('./pages/admin/BusRequests'))
const AdminRoutes = p(() => import('./pages/admin/RoutesAdmin'))
const AdminStops = p(() => import('./pages/admin/StopsAdmin'))
const AdminTracking = p(() => import('./pages/admin/Tracking'))
const AdminRides = p(() => import('./pages/admin/Rides'))
const AdminLocalCars = p(() => import('./pages/admin/LocalCarsAdmin'))
const AdminUsers = p(() => import('./pages/admin/Users'))
const AdminBookings = p(() => import('./pages/admin/BookingsAdmin'))
const Reports = p(() => import('./pages/admin/Reports'))
const AdminNotifications = p(() => import('./pages/admin/NotificationsAdmin'))
const AdminSupport = p(() => import('./pages/admin/SupportAdmin'))
const AdminSettings = p(() => import('./pages/admin/SettingsAdmin'))
const AdminProfile = p(() => import('./pages/admin/AdminProfile'))

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN']

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<LoadingSpinner fullPage label="" />}>
        <Routes>
          {/* public website */}
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
          </Route>

          {/* auth */}
          <Route element={<AuthLayout />}>
            <Route element={<GuestOnly />}>
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
            </Route>
            <Route path="admin/login" element={<AdminLogin />} />
          </Route>

          {/* passenger app - browsing works signed out */}
          <Route element={<AppLayout />}>
            <Route path="home" element={<Home />} />
            <Route path="search" element={<SearchResults />} />
            <Route path="bus/:id" element={<BusDetails />} />
            <Route path="bus/:id/track" element={<LiveTracking />} />
            <Route path="stops" element={<NearbyStops />} />
            <Route path="stops/:id" element={<StopDetails />} />
            <Route path="routes" element={<RoutesList />} />
            <Route path="routes/:id" element={<RouteDetails />} />
            <Route path="running-car" element={<RunningCar />} />
            <Route path="local-cars" element={<LocalCars />} />
            <Route path="local-cars/:id" element={<LocalCarDetails />} />

            <Route element={<RequireAuth />}>
              <Route path="bus/:id/alarm" element={<SetAlarm />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profile/edit" element={<EditProfile />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="bookings/:id" element={<BookingDetails />} />
              <Route path="alarms" element={<Alarms />} />
              <Route path="favorites" element={<Favorites />} />
              <Route path="recent-searches" element={<RecentSearches />} />
              <Route path="support" element={<Support />} />
              <Route path="settings" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="owner/buses" element={<MyBuses />} />
              <Route path="owner/buses/new" element={<BusForm />} />
              <Route path="owner/buses/:id/edit" element={<BusForm />} />
              <Route path="driver/cars" element={<MyCars />} />
            </Route>
          </Route>

          {/* admin panel */}
          <Route path="admin" element={<RequireRole roles={ADMIN_ROLES} loginPath="/admin/login" />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="buses" element={<AdminBuses />} />
              <Route path="buses/new" element={<BusForm admin />} />
              <Route path="buses/:id/edit" element={<BusForm admin />} />
              <Route path="bus-requests" element={<BusRequests />} />
              <Route path="routes" element={<AdminRoutes />} />
              <Route path="stops" element={<AdminStops />} />
              <Route path="tracking" element={<AdminTracking />} />
              <Route path="rides" element={<AdminRides />} />
              <Route path="local-cars" element={<AdminLocalCars />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="bookings" element={<AdminBookings />} />
              <Route path="reports" element={<Reports />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="support" element={<AdminSupport />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="profile" element={<AdminProfile />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
