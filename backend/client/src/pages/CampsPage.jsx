import React from "react";
import {
  Sun,
  Users,
  Trophy,
  Heart,
  Star,
  Clock,
  Calendar,
  Award,
} from "lucide-react";

const CampsPage = () => {
  const campInfo = {
    title: "Летние футбольные лагеря",
    subtitle:
      "Активный отдых, профессиональные тренировки и незабываемые впечатления для вашего ребенка",

    features: [
      {
        icon: Sun,
        title: "Летняя атмосфера",
        description:
          "Тренировки на свежем воздухе, игры и мероприятия под открытым небом",
      },
      {
        icon: Trophy,
        title: "Профессиональные тренировки",
        description: "Ежедневные занятия с лицензированными тренерами",
      },
      {
        icon: Users,
        title: "Новые друзья",
        description: "Командные игры помогают найти товарищей",
      },
      {
        icon: Heart,
        title: "Забота о здоровье",
        description: "Сбалансированное питание и медицинское сопровождение",
      },
    ],

    programs: [
      {
        name: "Городской лагерь",
        duration: "1 неделя",
        age: "5-12 лет",
        includes: ["Тренировки", "Питание", "Мастер-классы", "Экскурсии"],
      },
      {
        name: "Загородный лагерь",
        duration: "2 недели",
        age: "8-16 лет",
        includes: ["Проживание", "5-разовое питание", "Тренировки", "Походы"],
      },
    ],

    schedule: [
      { time: "09:00", activity: "Зарядка и завтрак" },
      { time: "10:00", activity: "Техническая тренировка" },
      { time: "12:00", activity: "Тактические занятия" },
      { time: "13:00", activity: "Обед и отдых" },
      { time: "15:00", activity: "Командные игры" },
      { time: "17:00", activity: "Творческие занятия" },
      { time: "19:00", activity: "Ужин и мероприятия" },
    ],
  };

  return (
    <div className="page-container1">
      <div className="simple-camps-page1">
        <div className="camps-content1">
          {/* Заголовок */}
          <div className="camps-header1">
            <h1>{campInfo.title}</h1>
            <p>{campInfo.subtitle}</p>
          </div>

          {/* Особенности */}
          <div className="camps-section1">
            <h2>Что ждет детей в лагере?</h2>
            <div className="features-list">
              {campInfo.features.map((feature, index) => {
                const IconComponent = feature.icon;
                return (
                  <div key={index} className="feature-item">
                    <IconComponent size={24} />
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Программы */}
          <div className="camps-section1">
            <h2>Наши программы</h2>
            <div className="programs-list1">
              {campInfo.programs.map((program, index) => (
                <div key={index} className="program-item1">
                  <h3>{program.name}</h3>
                  <div className="program-info1">
                    <span>⏱️ {program.duration}</span>
                    <span>👦 {program.age}</span>
                  </div>
                  <div className="includes1">
                    <p>Включено:</p>
                    <ul>
                      {program.includes.map((item, idx) => (
                        <li key={idx}>✓ {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Расписание */}
          <div className="camps-section1">
            <h2>Расписание дня</h2>
            <div className="schedule1">
              {campInfo.schedule.map((item, index) => (
                <div key={index} className="schedule-item1">
                  <span className="time">{item.time}</span>
                  <span className="activity">{item.activity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="camps-cta1">
            <h2>Готовы записать ребенка?</h2>
            <p>Свяжитесь с нами для получения информации</p>
            <div className="cta-buttons1">
              <button>Узнать подробности</button>
              <button>Записаться на консультацию</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampsPage;
