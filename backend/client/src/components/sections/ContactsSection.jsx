import React, { useEffect, useState } from "react";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  Check,
  MessageCircle,
  AlertCircle,
} from "lucide-react";

const ContactsSection = () => {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    childAge: "",
    branch: "",
    message: "",
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [siteContent, setSiteContent] = useState(null);
  const [branchList, setBranchList] = useState([]);

  // Исправляем получение URL API
  const API_URL = "/api"; // Прямо указываем URL

  const defaultContactInfo = [
    {
      icon: Phone,
      title: "Телефон",
      value: "+7 (999) 123-45-67",
      description: "Единый номер для записи",
    },
    {
      icon: Mail,
      title: "Email",
      value: "info@dneprovets.ru",
      description: "Общие вопросы",
    },
    {
      icon: MapPin,
      title: "Главный офис",
      value: "ул. Центральная, 15",
      description: "Центральный Арена",
    },
    {
      icon: Clock,
      title: "Время работы",
      value: "Пн-Вс: 08:00-22:00",
      description: "Ежедневно",
    },
  ];

  const defaultBranches = [
    {
      name: "Центральный Арена",
      address: "ул. Центральная, 15",
      phone: "+7 (999) 123-45-67",
      schedule: "Пн-Вс: 07:00-23:00",
    },
    {
      name: "Северный Стадион",
      address: "пр. Северный, 88",
      phone: "+7 (999) 123-45-68",
      schedule: "Пн-Сб: 08:00-22:00",
    },
    {
      name: "Южная Академия",
      address: "ул. Южная, 42",
      phone: "+7 (999) 123-45-69",
      schedule: "Пн-Вс: 06:00-24:00",
    },
  ];

  const ageGroups = ["2010-2012", "2013-2015", "2016-2018", "2019-2021"];

  useEffect(() => {
    const loadContent = async () => {
      try {
        const [siteResponse, branchesResponse] = await Promise.all([
          fetch(`${API_URL}/site-content`),
          fetch(`${API_URL}/branches`),
        ]);

        if (siteResponse.ok) {
          const siteResult = await siteResponse.json();
          if (siteResult.success) {
            setSiteContent(siteResult);
          }
        }

        if (branchesResponse.ok) {
          const branchesResult = await branchesResponse.json();
          if (branchesResult.success && Array.isArray(branchesResult.branches)) {
            setBranchList(branchesResult.branches);
          }
        }
      } catch (loadError) {
        console.error("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РєРѕРЅС‚Р°РєС‚РѕРІ:", loadError);
      }
    };

    loadContent();
  }, [API_URL]);

  const contactInfo = [
    {
      icon: Phone,
      title: "РўРµР»РµС„РѕРЅ",
      value: siteContent?.contact_info?.phone || defaultContactInfo[0].value,
      description: defaultContactInfo[0].description,
    },
    {
      icon: Mail,
      title: "Email",
      value: siteContent?.contact_info?.email || defaultContactInfo[1].value,
      description: defaultContactInfo[1].description,
    },
    {
      icon: MapPin,
      title: "Р“Р»Р°РІРЅС‹Р№ РѕС„РёСЃ",
      value: siteContent?.contact_info?.address || defaultContactInfo[2].value,
      description: defaultContactInfo[2].description,
    },
    {
      icon: Clock,
      title: "Р’СЂРµРјСЏ СЂР°Р±РѕС‚С‹",
      value:
        siteContent?.contact_info?.working_hours || defaultContactInfo[3].value,
      description: defaultContactInfo[3].description,
    },
  ];

  const branches =
    branchList.length > 0
      ? branchList.map((branch) => ({
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          schedule:
            siteContent?.contact_info?.working_hours || defaultContactInfo[3].value,
        }))
      : defaultBranches;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/send-application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setIsSubmitted(true);
        setFormData({
          name: "",
          phone: "",
          email: "",
          childAge: "",
          branch: "",
          message: "",
        });
        setTimeout(() => setIsSubmitted(false), 5000);
      } else {
        setError(result.message || "Произошла ошибка при отправке");
      }
    } catch (err) {
      setError("Ошибка соединения с сервером. Пожалуйста, попробуйте позже.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section id="contacts" className="contacts-section">
      <div className="section-container">
        <div className="contacts-content">
          <div className="contacts-section-header">
            <h2 className="contacts-section-title">Контакты</h2>
            <p className="contacts-section-subtitle">
              Свяжитесь с нами любым удобным способом - мы ответим на все ваши
              вопросы и поможем записаться на тренировку
            </p>
          </div>

          <div className="contacts-main-grid">
            <div className="contacts-info-section">
              <h3 className="contacts-info-title">Контактная информация</h3>

              <div className="contacts-info-grid">
                {contactInfo.map((contact, index) => {
                  const IconComponent = contact.icon;
                  return (
                    <div key={index} className="contact-info-card">
                      <div className="contact-info-icon">
                        <IconComponent size={24} />
                      </div>
                      <div className="contact-info-content">
                        <h4 className="contact-info-title">{contact.title}</h4>
                        <p className="contact-info-value">{contact.value}</p>
                        <p className="contact-info-description">
                          {contact.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="contacts-form-section">
              <div className="contacts-form-header">
                <MessageCircle size={32} />
                <h3 className="contacts-form-title">
                  Записаться на пробную тренировку
                </h3>
                <p className="contacts-form-subtitle">
                  Заполните форму и мы свяжемся с вами в течение 30 минут
                </p>
              </div>

              {isSubmitted ? (
                <div className="contacts-success-message">
                  <Check size={48} />
                  <h4>Заявка отправлена!</h4>
                  <p>
                    Мы свяжемся с вами в ближайшее время для уточнения деталей
                  </p>
                </div>
              ) : (
                <form className="contacts-form" onSubmit={handleSubmit}>
                  {error && (
                    <div className="form-error-message">
                      <AlertCircle size={20} />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="name" className="form-label">
                        Имя родителя *
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        style={{ color: "white", background: "#2e2e2e" }}
                        value={formData.name}
                        onChange={handleInputChange}
                        className="form-input"
                        required
                        placeholder="Ваше имя"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="phone" className="form-label">
                        Телефон *
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        style={{ color: "white", background: "#2e2e2e" }}
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="form-input"
                        required
                        placeholder="+7 (999) 123-45-67"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="email" className="form-label">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        style={{ color: "white", background: "#2e2e2e" }}
                        value={formData.email}
                        onChange={handleInputChange}
                        className="form-input"
                        placeholder="your@email.com"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="childAge" className="form-label">
                        Год рождения *
                      </label>
                      <select
                        id="childAge"
                        name="childAge"
                        style={{ color: "white", background: "#2e2e2e" }}
                        value={formData.childAge}
                        onChange={handleInputChange}
                        className="form-select"
                        required
                        disabled={isLoading}
                      >
                        <option value="">Выберите возраст</option>
                        {ageGroups.map((age, index) => (
                          <option
                            key={index}
                            value={age}
                            style={{ background: "#2e2e2e" }}
                          >
                            {age}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="branch" className="form-label">
                      Предпочтительный филиал
                    </label>
                    <select
                      id="branch"
                      name="branch"
                      style={{
                        color: "white",
                        background: "#2e2e2e",
                      }}
                      value={formData.branch}
                      onChange={handleInputChange}
                      className="form-select"
                      disabled={isLoading}
                    >
                      <option
                        value=""
                        style={{
                          background: "#2e2e2e",
                        }}
                      >
                        Любой удобный филиал
                      </option>
                      {branches.map((branch, index) => (
                        <option
                          key={index}
                          value={branch.name}
                          style={{
                            backgroundColor: "#2e2e2e",
                          }}
                        >
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="message" className="form-label">
                      Дополнительная информация
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      className="form-textarea"
                      rows="4"
                      placeholder="Особые пожелания, уровень подготовки ребенка и т.д."
                      disabled={isLoading}
                    />
                  </div>

                  <button
                    type="submit"
                    className="contacts-submit-button"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      "Отправка..."
                    ) : (
                      <>
                        <Send size={20} />
                        Отправить заявку
                      </>
                    )}
                  </button>

                  <p className="form-note">
                    Нажимая кнопку, вы соглашаетесь с политикой
                    конфиденциальности
                  </p>
                </form>
              )}
            </div>
          </div>

          <div className="contacts-map-section">
            <h3 className="contacts-map-title">Мы на карте</h3>
            <div className="contacts-map-placeholder">
              {/* <MapPin size={48} />
              <p>Интерактивная карта с расположением всех филиалов</p>
              <span>Здесь будет подключен Яндекс.Карты или Google Maps</span> */}
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  width: "100%",
                  height: "100%",
                  borderRadius: "15px",
                }}
              >
                <a
                  href="https://yandex.ru/maps/org/dneprovets/199792423224/?utm_medium=mapframe&utm_source=maps"
                  style={{
                    color: "#eee",
                    fontSize: "12px",
                    position: "absolute",
                    top: "0px",
                  }}
                >
                  Днепровец
                </a>
                <a
                  href="https://yandex.ru/maps/10743/odincovo/category/sports_club/184107297/?utm_medium=mapframe&utm_source=maps"
                  style={{
                    color: "#eee",
                    fontSize: "12px",
                    position: "absolute",
                    top: "14px",
                  }}
                >
                  Спортивный клуб, секция в Одинцово
                </a>
                <iframe
                  src="https://yandex.ru/map-widget/v1/org/dneprovets/199792423224/reviews/?ll=37.275521%2C55.685858&utm_content=add_review&utm_medium=reviews&utm_source=maps-reviews-widget&z=16"
                  width="100%"
                  height="100%"
                  frameBorder="1"
                  allowFullScreen={true}
                  style={{ position: "relative", borderRadius: "15px" }}
                ></iframe>
              </div>
            </div>
          </div>

          <div className="contacts-social-section">
            <div className="contacts-social-content">
              <h3 className="contacts-social-title">Мы в социальных сетях</h3>
              <p className="contacts-social-description">
                Следите за жизнью школы, смотрите фото и видео с тренировок,
                будьте в курсе событий
              </p>
              <div className="contacts-social-buttons">
                <button className="social-button social-vk">VK</button>
                <button className="social-button social-telegram">
                  Telegram
                </button>
                <button className="social-button social-instagram">
                  Instagram
                </button>
                <button className="social-button social-youtube">
                  YouTube
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactsSection;
