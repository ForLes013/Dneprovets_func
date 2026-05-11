import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone, Eye, EyeOff, ArrowLeft } from "lucide-react";

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Если пользователь уже авторизован, перенаправляем в профиль
    const user = localStorage.getItem("user");
    if (user) {
      navigate("/profile");
    }
  }, [navigate]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Валидация
      if (formData.password !== formData.confirmPassword) {
        setError("Пароли не совпадают");
        setLoading(false);
        return;
      }
      if (formData.password.length < 6) {
        setError("Пароль должен быть не менее 6 символов");
        setLoading(false);
        return;
      }

      const payload = {
        email: formData.email,
        name: formData.name,
        password: formData.password,
        phone: formData.phone,
      };

      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        localStorage.setItem("token", result.token);
        localStorage.setItem("user", JSON.stringify(result.user));
        navigate("/profile");
      } else {
        setError(result.error || "Произошла ошибка при регистрации");
      }
    } catch (err) {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Регистрация</h1>
            <p>Создайте новый аккаунт чтобы продолжить</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <Mail size={20} />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <User size={20} />
              <input
                type="text"
                name="name"
                placeholder="Ваше имя"
                value={formData.name}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <Phone size={20} />
              <input
                type="tel"
                name="phone"
                placeholder="Телефон (необязательно)"
                value={formData.phone}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <Lock size={20} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Пароль"
                value={formData.password}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="form-group">
              <Lock size={20} />
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="Подтвердите пароль"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? "Регистрация..." : "Зарегистрироваться"}
            </button>
          </form>

          <div className="auth-switch">
            <p>
              Уже есть аккаунт?
              <Link to="/login" className="switch-link">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
