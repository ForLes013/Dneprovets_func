import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Header from "./components/layout/Header.jsx";
import Footer from "./components/layout/Footer.jsx";
import HomePage from "./pages/HomePage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import CampsPage from "./pages/CampsPage.jsx";
import AchievementsPage from "./pages/AchievementsPage.jsx";
import UserProfile from "./pages/UserProfile.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import "./styles/App.css";

function App() {
  return (
    <Router>
      <div className="app">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/raspisanie" element={<SchedulePage />} />
            <Route path="/letnie-lagerya" element={<CampsPage />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/dostizheniya" element={<AchievementsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route
              path="/admin"
              element={<Navigate to="/admin/login" replace />}
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
