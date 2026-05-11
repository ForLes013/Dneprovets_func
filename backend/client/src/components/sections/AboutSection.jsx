import React from "react";
import {
  Target,
  Heart,
  Users,
  Star,
  Award,
  Clock,
  TrendingUp,
} from "lucide-react";

const AboutSection = () => {
  const values = [
    {
      icon: Target,
      title: "Миссия",
      description:
        "Воспитывать чемпионов не только в футболе, но и в жизни через спорт и дисциплину",
    },
    {
      icon: Heart,
      title: "Ценности",
      description:
        "Честность, уважение, дисциплина, командный дух и стремление к совершенству",
    },
    {
      icon: Users,
      title: "Сообщество",
      description:
        "Создаем сильное футбольное сообщество, где каждый ребенок чувствует поддержку",
    },
    {
      icon: Star,
      title: "Качество",
      description:
        "Европейские стандарты подготовки и индивидуальный подход к каждому ученику",
    },
  ];

  const stats = [
    {
      icon: Users,
      value: "500+",
      label: "Учеников",
    },
    {
      icon: Award,
      value: "50+",
      label: "Наград",
    },
    {
      icon: Clock,
      value: "4",
      label: "Года работы",
    },
    {
      icon: TrendingUp,
      value: "90%",
      label: "Успешных выпускников",
    },
  ];

  const features = [
    {
      title: "Профессиональные тренеры",
      description: "Все тренеры имеют лицензии UEFA и опыт работы с детьми",
    },
    {
      title: "Современные методики",
      description: "Используем передовые европейские методики подготовки",
    },
    {
      title: "Безопасность",
      description:
        "Полностью оборудованные площадки и медицинское сопровождение",
    },
    {
      title: "Развитие характера",
      description: "Учим ответственности, лидерству и работе в команде",
    },
  ];

  return (
    <section id="about" className="about-section">
      <div className="section-container">
        <div className="about-content">
          <div className="about-section-header">
            <h2 className="about-section-title">О нашей школе</h2>
            <p className="about-section-subtitle">
              Мы не просто учим играть в футбол - мы воспитываем характер,
              развиваем лидерские качества и создаем будущих чемпионов
            </p>
          </div>

          <div className="about-main-content">
            <div className="about-text-content">
              <div className="about-description">
                <h3>Почему выбирают нас?</h3>
                <p>
                  Футбольная школа «Днепровец» — это место, где дети не просто
                  тренируются, а растут как спортсмены и личности. Мы работаем
                  по продуманной системе подготовки, которая соединяет
                  дисциплину, движение и понимание игры. За пять лет мы выросли
                  из небольшой группы в школу с тремя локациями и более чем 100
                  учениками.
                </p>
                <p>
                  Мы знаем, как помочь ребёнку сделать шаг вперёд — независимо
                  от того, приходит он впервые или уже имеет опыт.
                </p>
              </div>

              <div className="about-features-grid">
                {features.map((feature, index) => (
                  <div key={index} className="about-feature-card">
                    <h4 className="about-feature-title">{feature.title}</h4>
                    <p className="about-feature-description">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="about-visual-content">
              <div className="about-stats-grid">
                {stats.map((stat, index) => (
                  <div key={index} className="about-stat-card">
                    <div className="about-stat-icon">
                      <stat.icon size={24} />
                    </div>
                    <div className="about-stat-value">{stat.value}</div>
                    <div className="about-stat-label">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="about-values-section">
                <h3 className="about-values-title">Наши ценности</h3>
                <div className="about-values-grid">
                  {values.map((value, index) => (
                    <div key={index} className="about-value-card">
                      <div className="about-value-icon">
                        <value.icon size={20} />
                      </div>
                      <div className="about-value-content">
                        <h4 className="about-value-title">{value.title}</h4>
                        <p className="about-value-description">
                          {value.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="about-cta-section">
            <div className="about-cta-content">
              <h3 className="about-cta-title">Готовы начать тренировки?</h3>
              <p className="about-cta-description">
                Присоединяйтесь к нашей футбольной семье и откройте мир
                возможностей для вашего ребенка
              </p>
              <a
                className="about-cta-button"
                href="#contacts"
                style={{ textDecoration: "none" }}
              >
                Записаться на пробную тренировку
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
