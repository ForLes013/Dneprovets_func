import React, { useState } from "react";
import { X, Mail, User, Lock, Eye, EyeOff, Phone } from "lucide-react";

const AuthModal = ({ isOpen, onClose, onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
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
      if (!isLogin) {
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
      }

      const endpoint = isLogin ? "/api/login" : "/api/register";
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : {
            email: formData.email,
            name: formData.name,
            password: formData.password,
            phone: formData.phone,
          };

      const response = await fetch(`${endpoint}`, {
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
        onSuccess(result.user);
        onClose();
        resetForm();
      } else {
        setError(result.error || "Произошла ошибка");
      }
    } catch (err) {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      name: "",
      phone: "",
      password: "",
      confirmPassword: "",
    });
    setError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    resetForm();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal">
        <button className="auth-close-btn" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="auth-header">
          <h2>{isLogin ? "Вход в аккаунт" : "Регистрация"}</h2>
          <p>{isLogin ? "Войдите в свой аккаунт" : "Создайте новый аккаунт"}</p>
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

          {!isLogin && (
            <>
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
            </>
          )}

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

          {!isLogin && (
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
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            {isLogin ? "Еще нет аккаунта?" : "Уже есть аккаунт?"}
            <button type="button" onClick={switchMode} disabled={loading}>
              {isLogin ? "Зарегистрироваться" : "Войти"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
