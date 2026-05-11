import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Shield, User } from "lucide-react";

const AdminLogin = () => {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleInputChange = (event) => {
    setFormData((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }));
    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || "Неверные учетные данные");
        return;
      }

      localStorage.setItem("adminToken", result.token);
      localStorage.setItem("adminUser", JSON.stringify(result.user));
      navigate("/admin/dashboard", { replace: true });
    } catch (requestError) {
      console.error("Admin login failed:", requestError);
      setError(
        "Ошибка соединения с сервером. Проверьте, что backend запущен и админская учетная запись настроена.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <Shield size={48} color="#d4a574" />
            <h1>Вход в админ-панель</h1>
            <p>Доступ только для администраторов системы.</p>
            <p style={{ fontSize: "0.9rem", color: "#666", marginTop: "10px" }}>
              Учетные данные задаются на сервере и больше не отображаются на странице входа.
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={16} />
                <span>{error}</span>
              </div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <User size={20} />
              <input
                type="text"
                name="username"
                placeholder="Имя администратора"
                value={formData.username}
                onChange={handleInputChange}
                required
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
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <div className="loading-spinner-small" />
                  Вход...
                </>
              ) : (
                "Войти как администратор"
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .loading-spinner-small {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s ease-in-out infinite;
          margin-right: 8px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminLogin;
