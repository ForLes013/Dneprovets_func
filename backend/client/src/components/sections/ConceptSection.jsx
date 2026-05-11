import React from "react";
import {
  Target,
  Brain,
  Heart,
  Users,
  Shield,
  Award,
  Star,
  Zap,
  Clock,
  TrendingUp,
} from "lucide-react";

const ConceptSection = () => {
  const pillars = [
    {
      icon: Brain,
      title: "Интеллектуальное развитие",
      description:
        "Развиваем тактическое мышление, учим читать игру и принимать быстрые решения",
      features: [
        "Тактический анализ",
        "Игровое мышление",
        "Стратегическое планирование",
      ],
    },
    {
      icon: Heart,
      title: "Эмоциональный интеллект",
      description:
        "Воспитываем лидерские качества, стрессоустойчивость и командный дух",
      features: ["Лидерство", "Работа в команде", "Эмоциональная устойчивость"],
    },
    {
      icon: Zap,
      title: "Физическое совершенство",
      description: "Комплексное развитие всех физических качеств футболиста",
      features: ["Координация", "Скорость", "Выносливость", "Сила"],
    },
    {
      icon: Users,
      title: "Социальное развитие",
      description:
        "Формируем коммуникативные навыки и уважение к партнерам и соперникам",
      features: ["Коммуникация", "Уважение", "Спортивное поведение"],
    },
  ];

  const methodology = [
    {
      stage: "1",
      title: "Диагностика",
      description:
        "Комплексная оценка способностей и потенциала каждого ребенка",
      icon: Target,
    },
    {
      stage: "2",
      title: "Индивидуальный план",
      description:
        "Разработка персональной траектории развития на основе диагностики",
      icon: TrendingUp,
    },
    {
      stage: "3",
      title: "Системные тренировки",
      description:
        "Регулярные занятия по современным методикам с контролем прогресса",
      icon: Clock,
    },
    {
      stage: "4",
      title: "Оценка результатов",
      description: "Анализ достижений и корректировка программы развития",
      icon: Star,
    },
  ];

  const advantages = [
    {
      icon: Shield,
      title: "Безопасность",
      description:
        "Все тренировки проходят на сертифицированных площадках с медицинским сопровождением",
    },
    {
      icon: Award,
      title: "Профессионализм",
      description:
        "Тренеры с UEFA лицензиями и опытом работы в ведущих академиях",
    },
    {
      icon: Users,
      title: "Индивидуальный подход",
      description:
        "Не более 12 детей в группе для максимального внимания каждому",
    },
    {
      icon: Heart,
      title: "Любовь к игре",
      description:
        "Создаем атмосферу, в которой дети полюбят футбол на всю жизнь",
    },
  ];

  const results = [
    {
      value: "95%",
      label: "Учеников",
      description: "продолжают заниматься футболом",
    },
    {
      value: "70%",
      label: "Выпускников",
      description: "попадают в спортивные академии",
    },
    {
      value: "85%",
      label: "Родителей",
      description: "отмечают улучшение успеваемости в школе",
    },
    {
      value: "100%",
      label: "Детей",
      description: "становятся более дисциплинированными",
    },
  ];

  return (
    <section id="concept" className="concept-section">
      <div className="section-container">
        <div className="concept-content">
          <div className="concept-section-header">
            <h2 className="concept-section-title">Наша концепция</h2>
            <p className="concept-section-subtitle">
              Гармоничное развитие личности через футбол: где техническое
              мастерство встречается с характером
            </p>
          </div>

          <div className="concept-pillars-section">
            <h3 className="concept-pillars-title">
              Четыре столпа нашей философии
            </h3>
            <div className="concept-pillars-grid">
              {pillars.map((pillar, index) => (
                <div key={index} className="concept-pillar-card">
                  <div className="concept-pillar-icon">
                    <pillar.icon size={32} />
                  </div>
                  <h4 className="concept-pillar-title">{pillar.title}</h4>
                  <p className="concept-pillar-description">
                    {pillar.description}
                  </p>
                  <div className="concept-pillar-features">
                    {pillar.features.map((feature, idx) => (
                      <span key={idx} className="concept-feature-tag">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="concept-methodology-section">
            <div className="concept-methodology-header">
              <h3 className="concept-methodology-title">
                Методология развития
              </h3>
              <p className="concept-methodology-subtitle">
                Системный подход к подготовке, доказавший свою эффективность
              </p>
            </div>
            <div className="concept-methodology-steps">
              {methodology.map((step, index) => (
                <div key={index} className="concept-methodology-step">
                  <div className="concept-step-header">
                    <div className="concept-step-number">{step.stage}</div>
                    <div className="concept-step-icon">
                      <step.icon size={24} />
                    </div>
                  </div>
                  <h4 className="concept-step-title">{step.title}</h4>
                  <p className="concept-step-description">{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="concept-philosophy-section">
            <div className="concept-philosophy-content">
              <h3 className="concept-philosophy-title">Наша философия</h3>
              <div className="concept-philosophy-text">
                <p>
                  Мы верим, что футбол — это не просто спорт, а мощный
                  инструмент воспитания характера. Каждая тренировка, каждая
                  игра — это возможность научиться чему-то новому не только о
                  футболе, но и о себе.
                </p>
                <p>
                  Наша цель — не просто вырастить техничного футболиста, а
                  помочь каждому ребенку стать уверенной в себе личностью,
                  способной ставить цели и достигать их, работать в команде и
                  уважать соперника.
                </p>
                <blockquote className="concept-quote">
                  «Не ищи лёгкого. Ищи прогресс. Победы придут.» - Шигидин
                  Александр Александрович
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConceptSection;
