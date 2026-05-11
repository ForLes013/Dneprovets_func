import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, ChevronDown, User, Shield } from "lucide-react";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHomeHovered, setIsHomeHovered] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const timeoutRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem("adminToken");

  const homeSections = [
    { name: "История клуба", path: "/#history" },
    { name: "Методика обучения", path: "/#methodology" },
    { name: "Филиалы", path: "/#branches" },
    { name: "О нас", path: "/#about" },
    { name: "Концепция", path: "/#concept" },
    { name: "Тренеры", path: "/#team" },
  ];

  // Функция для загрузки пользователя
  const loadUser = () => {
    const user = localStorage.getItem("user");
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  };

  // Загружаем пользователя при монтировании и при изменении location
  useEffect(() => {
    loadUser();
  }, [location]);

  // Блокируем прокрутку body при открытом мобильном меню
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMenuOpen]);

  const handleHomeSectionClick = (path) => {
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => {
        const anchor = path.split("#")[1];
        const element = document.getElementById(anchor);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    } else {
      const anchor = path.split("#")[1];
      const element = document.getElementById(anchor);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
    setIsMenuOpen(false);
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsHomeHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHomeHovered(false);
    }, 300);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("adminToken");
    setCurrentUser(null);
    if (
      location.pathname === "/profile" ||
      location.pathname === "/login" ||
      location.pathname === "/register" ||
      location.pathname === "/admin/dashboard"
    ) {
      navigate("/");
    }
    setIsMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* Логотип */}
        <div className="logo">
          <Link
            to="/"
            className="logo-link"
            onClick={() => setIsMenuOpen(false)}
          >
            <span className="logo-text">Днепровец</span>
            <span className="logo-subtitle">Футбольная школа</span>
          </Link>
        </div>

        {/* Десктопная навигация */}
        <nav className="desktop-nav">
          <div
            className="nav-item2 dropdown-trigger"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <span className="nav-link">
              Главная <ChevronDown size={16} />
            </span>

            {/* Выпадающее меню */}
            <div
              className={`dropdown-menu ${
                isHomeHovered ? "dropdown-visible" : ""
              }`}
            >
              {homeSections.map((section, index) => (
                <button
                  key={section.name}
                  onClick={() => handleHomeSectionClick(section.path)}
                  className="dropdown-item"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {section.name}
                </button>
              ))}
            </div>
          </div>

          <Link
            to="/raspisanie"
            className={`nav-link ${
              location.pathname === "/raspisanie" ? "active" : ""
            }`}
            onClick={() => setIsMenuOpen(false)}
          >
            Расписание
          </Link>
          <Link
            to="/letnie-lagerya"
            className={`nav-link ${
              location.pathname === "/letnie-lagerya" ? "active" : ""
            }`}
            onClick={() => setIsMenuOpen(false)}
          >
            Летние лагеря
          </Link>
          <Link
            to="/dostizheniya"
            className={`nav-link ${
              location.pathname === "/dostizheniya" ? "active" : ""
            }`}
            onClick={() => setIsMenuOpen(false)}
          >
            Достижения
          </Link>
        </nav>

        {/* Десктопные кнопки авторизации и админ-панель */}
        <div className="desktop-actions">
          {currentUser ? (
            <div className="user-menu">
              <Link to="/profile" className="user-profile-link">
                <User size={20} />
                <span className="user-name">{currentUser.name}</span>
              </Link>
              <button onClick={handleLogout} className="header-logout-btn">
                Выйти
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="login-btn">
                Войти
              </Link>
              <Link to="/register" className="register-btn">
                Регистрация
              </Link>
            </div>
          )}

          {isAdmin && (
            <Link to="/admin/dashboard" className="admin-link">
              <Shield size={18} />
              <span>Админ</span>
            </Link>
          )}
        </div>

        {/* Мобильное меню кнопка */}
        <button
          className="mobile-menu-btn"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Меню"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Мобильная навигация */}
        <div className={`mobile-nav ${isMenuOpen ? "mobile-nav-open" : ""}`}>
          <div className="mobile-nav-content">
            {/* Раздел Главная с подразделами */}
            <div className="mobile-nav-section">
              <div className="mobile-nav-title">Главная</div>
              <div className="mobile-dropdown">
                {homeSections.map((section) => (
                  <button
                    key={section.name}
                    onClick={() => handleHomeSectionClick(section.path)}
                    className="mobile-dropdown-item"
                  >
                    {section.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Основные ссылки */}
            <div className="mobile-nav-section">
              <Link
                to="/raspisanie"
                className={`mobile-nav-link ${
                  location.pathname === "/raspisanie" ? "active" : ""
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Расписание
              </Link>
              <Link
                to="/letnie-lagerya"
                className={`mobile-nav-link ${
                  location.pathname === "/letnie-lagerya" ? "active" : ""
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Летние лагеря
              </Link>
              <Link
                to="/dostizheniya"
                className={`mobile-nav-link ${
                  location.pathname === "/dostizheniya" ? "active" : ""
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Достижения
              </Link>
            </div>

            {/* Мобильная авторизация и админ-панель */}
            <div className="mobile-nav-section mobile-auth-section">
              <div className="mobile-nav-title">Аккаунт</div>
              {currentUser ? (
                <>
                  <Link
                    to="/profile"
                    className="mobile-nav-link mobile-profile-link"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <User size={20} />
                    <span>Личный кабинет ({currentUser.name})</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="mobile-nav-link mobile-logout-btn"
                  >
                    Выйти
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="mobile-nav-link mobile-login-btn"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Войти
                  </Link>
                  <Link
                    to="/register"
                    className="mobile-nav-link mobile-register-btn"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Регистрация
                  </Link>
                </>
              )}

              {isAdmin && (
                <Link
                  to="/admin/dashboard"
                  className="mobile-nav-link mobile-admin-link"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Shield size={20} />
                  <span>Админ-панель</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
