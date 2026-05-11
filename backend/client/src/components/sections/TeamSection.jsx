import React, { useEffect, useState } from "react";
import {
  Users,
  Award,
  Clock,
  Star,
  Target,
  Mail,
  Phone,
} from "lucide-react";
import admin1 from "../../utils/shigidin alexandr.png";
import admin2 from "../../utils/ludmila.png";
import t1 from "../../utils/maksuta maksim.png";
import t2 from "../../utils/trenir.jpg";
import t3 from "../../utils/Fenis.png";

const TeamSection = () => {
  const [siteContent, setSiteContent] = useState(null);

  useEffect(() => {
    const loadSiteContent = async () => {
      try {
        const response = await fetch("/api/site-content");
        if (!response.ok) {
          return;
        }

        const result = await response.json();
        if (result.success) {
          setSiteContent({
            trainers: Array.isArray(result.trainers) ? result.trainers : [],
          });
        }
      } catch (error) {
        console.error("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РґР°РЅРЅС‹С… Рѕ С‚СЂРµРЅРµСЂР°С…:", error);
      }
    };

    loadSiteContent();
  }, []);

  const teamMembers = [
    // Администрация
    {
      type: "admin",
      name: "Шигидин Александр",
      position: "Спортивный директор, старший тренер",
      experience: "15 лет в спортивном менеджменте",
      education: "Высшее спортивное образование, MBA",
      achievements: [
        "Основатель школы",
        "Эксперт в детском спорте",
        "Организатор турниров",
      ],
      specialization: "Стратегическое развитие, управление",
      email: "a.ivanov@dneprovets.ru",
      phone: "+7 (999) 123-45-67",
      photo: admin1,
      features: [
        "Стратегическое планирование",
        "Развитие бренда",
        "Международные связи",
      ],
    },
    {
      type: "admin",
      name: "Шигидина Людмила",
      position: "Генеральный директор",
      experience: "10 лет в управлении спортивными объектами",
      education: "МГУП факультет экономики, Общественный деятель",
      achievements: [
        "Оптимизация процессов",
        "Развитие филиальной сети",
        "HR менеджмент",
      ],
      specialization: "Операционное управление, клиентский сервис",
      email: "m.petrova@dneprovets.ru",
      phone: "+7 (999) 123-45-68",
      photo: admin2,
      features: [
        "Управление персоналом",
        "Клиентский сервис",
        "Бюджетирование",
      ],
    },
    // Тренеры
    {
      type: "coach",
      name: "Максюта Максим",
      position:
        "Главный тренер команд 2014 г.р. и 2012-11 г.р., тренер вратарей",
      experience: "12 лет тренерской работы",
      education: "-2022 Категория С-UEFA",
      achievements: [
        "Подготовил 50+ игроков для академий",
        "Победитель региональных турниров",
        "Эксперт по тактике",
      ],
      specialization: "Старшие группы (14-16 лет), тактическая подготовка",
      email: "d.sokolov@dneprovets.ru",
      phone: "+7 (999) 123-45-69",
      photo: t1,
      features: [
        "Тактический анализ",
        "Индивидуальная работа",
        "Подготовка к академиям",
      ],
    },
    {
      type: "coach",
      name: "Лёзов Евгений",
      position: "Тренер",
      experience: "8 лет работы с детьми",
      education: "UEFA A лицензия, педагогическое образование",
      achievements: [
        "Специалист по работе с младшими группами",
        "Разработчик методик",
        "Мастер-тренер",
      ],
      specialization: "Младшие группы (5-10 лет), техническая подготовка",
      email: "a.kozlova@dneprovets.ru",
      phone: "+7 (999) 123-45-70",
      photo: t2,
      features: ["Развитие координации", "Базовая техника", "Игровые методики"],
    },
    {
      type: "coach",
      name: "Хуснетдинов Фенис",
      position: "Тренер",
      experience: "10 лет в профессиональном футболе",
      education: "Специализация по спортивной медицине, UEFA A",
      achievements: [
        "Бывший профессиональный игрок",
        "Специалист по реабилитации",
        "Эксперт по ОФП",
      ],
      specialization: "Физическая подготовка, реабилитация",
      email: "s.volkov@dneprovets.ru",
      phone: "+7 (999) 123-45-71",
      photo: t3,
      features: [
        "Функциональный тренинг",
        "Профилактика травм",
        "Индивидуальные программы",
      ],
    },
  ];

  const resolvedAdministrationMembers =
    Array.isArray(siteContent?.administration) &&
    siteContent.administration.some(
      (member) =>
        member?.name?.trim() ||
        member?.title?.trim() ||
        member?.description?.trim() ||
        member?.email?.trim() ||
        member?.phone?.trim() ||
        member?.photo_data?.trim() ||
        member?.photoData?.trim(),
    )
      ? siteContent.administration
          .filter(
            (member) =>
              member?.name?.trim() ||
              member?.title?.trim() ||
              member?.description?.trim() ||
              member?.email?.trim() ||
              member?.phone?.trim() ||
              member?.photo_data?.trim() ||
              member?.photoData?.trim(),
          )
          .map((member, index) => ({
            type: "admin",
            name: member.name || "Администрация",
            position: member.title || "Сотрудник администрации",
            experience: "",
            education: "",
            achievements: [],
            specialization: member.description || "",
            specializationLabel: "О сотруднике",
            email: member.email || "",
            phone: member.phone || "",
            photo: member.photo_data || member.photoData || [admin1, admin2][index % 2],
            features: [],
          }))
      : teamMembers
          .filter((member) => member.type === "admin")
          .map((member) => ({
            ...member,
            specializationLabel: "Направление",
          }));

  const coachMembers =
    siteContent?.trainers?.length > 0
      ? siteContent.trainers.map((trainer, index) => ({
          type: "coach",
          name: trainer.name,
          position: trainer.title || "Тренер",
          experience: trainer.title || "Тренер",
          education: "",
          achievements: [],
          specialization: trainer.description || "",
          email: "",
          phone: "",
          photo: [t1, t2, t3][index % 3],
          features: [],
        }))
      : teamMembers.filter((member) => member.type === "coach");

  const resolvedCoachMembers =
    Array.isArray(siteContent?.trainers) &&
    siteContent.trainers.some(
      (trainer) =>
        trainer?.name?.trim() ||
        trainer?.title?.trim() ||
        trainer?.description?.trim() ||
        trainer?.photo_data?.trim() ||
        trainer?.photoData?.trim(),
    )
      ? siteContent.trainers
          .filter(
            (trainer) =>
              trainer?.name?.trim() ||
              trainer?.title?.trim() ||
              trainer?.description?.trim() ||
              trainer?.photo_data?.trim() ||
              trainer?.photoData?.trim(),
          )
          .map((trainer, index) => ({
            type: "coach",
            name: trainer.name || "Тренер",
            position: trainer.title || "Тренер",
            experience: "",
            education: "",
            achievements: [],
            specialization: trainer.description || "",
            specializationLabel: "О тренере",
            email: "",
            phone: "",
            photo:
              trainer.photo_data ||
              trainer.photoData ||
              [t1, t2, t3][index % 3],
            features: [],
          }))
      : coachMembers.map((member) => ({
          ...member,
          specializationLabel: "Специализация",
        }));

  const stats = [
    {
      icon: Users,
      value: "4",
      label: "Профессионалов",
      description: "в команде",
    },
    {
      icon: Award,
      value: "25+",
      label: "Лет опыта",
      description: "суммарно",
    },
    {
      icon: Star,
      value: "100%",
      label: "Тренеров",
      description: "с лицензиями UEFA",
    },
    {
      icon: Target,
      value: "300+",
      label: "Учеников",
      description: "прошли нашу футбольную школу",
    },
  ];

  const certifications = [
    {
      title: "UEFA PRO",
      description: "Высшая тренерская категория",
      holders: ["Дмитрий Соколов"],
    },
    {
      title: "UEFA A",
      description: "Профессиональная лицензия",
      holders: ["Анна Козлова", "Сергей Волков"],
    },
    {
      title: "Спортивный менеджмент",
      description: "Управление спортивными организациями",
      holders: ["Александр Иванов", "Мария Петрова"],
    },
  ];

  return (
    <section id="team" className="team-section">
      <div className="section-container">
        <div className="team-content">
          <div className="team-section-header">
            <h2 className="team-section-title">Наша команда</h2>
            <p className="team-section-subtitle">
              Профессионалы с большим опытом, которые помогут вашему ребенку
              раскрыть потенциал и полюбить футбол
            </p>
          </div>

          <div className="team-stats-grid">
            {stats.map((stat, index) => (
              <div key={index} className="team-stat-card">
                <div className="team-stat-icon">
                  <stat.icon size={28} />
                </div>
                <div className="team-stat-content">
                  <div className="team-stat-value">{stat.value}</div>
                  <div className="team-stat-label">{stat.label}</div>
                  <div className="team-stat-description">
                    {stat.description}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="team-administration-section">
            <h3 className="team-administration-title">Администрация</h3>
            <div className="team-administration-grid">
              {teamMembers
                .filter((member) => member.type === "admin")
                .map((member, index) => (
                  <div key={index} className="team-admin-card">
                    <div className="team-member-photo">
                      <div className="team-photo-placeholder">
                        <img
                          src={member.photo}
                          alt=""
                          loading="lazy"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "top",
                          }}
                        />
                      </div>
                    </div>
                    <div className="team-member-content">
                      <h4 className="team-member-name">{member.name}</h4>
                      <p className="team-member-position">{member.position}</p>
                      <div className="team-member-info">
                        <div className="team-info-item">
                          <Clock size={16} />
                          <span>{member.experience}</span>
                        </div>
                        <div className="team-info-item">
                          <Award size={16} />
                          <span>{member.education}</span>
                        </div>
                      </div>
                      <div className="team-member-achievements">
                        {member.achievements.map((achievement, idx) => (
                          <span key={idx} className="team-achievement-tag">
                            {achievement}
                          </span>
                        ))}
                      </div>
                      <div className="team-member-specialization">
                        <strong>Направление:</strong> {member.specialization}
                      </div>
                      <div className="team-member-features">
                        {member.features.map((feature, idx) => (
                          <span key={idx} className="team-feature-tag">
                            {feature}
                          </span>
                        ))}
                      </div>
                      <div className="team-member-contacts">
                        <div className="team-contact-item">
                          <Mail size={16} />
                          <span>{member.email}</span>
                        </div>
                        <div className="team-contact-item">
                          <Phone size={16} />
                          <span>{member.phone}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="team-coaches-section">
            <h3 className="team-coaches-title">Тренерский состав</h3>
            <div className="team-coaches-grid">
              {resolvedCoachMembers.map((member, index) => (
                  <div key={index} className="team-coach-card">
                    <div className="team-member-photo">
                      <div className="team-photo-placeholder">
                        {member.photo ? (
                          <img
                            src={member.photo}
                            alt={member.name}
                            loading="lazy"
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: "50%",
                              objectFit: "cover",
                              objectPosition: "top",
                            }}
                          />
                        ) : (
                          <>
                            <Users size={42} />
                            <span>{member.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="team-member-content">
                      <h4 className="team-member-name">{member.name}</h4>
                      <p className="team-member-position">{member.position}</p>
                      {(member.experience || member.education) && (
                        <div className="team-member-info">
                          {member.experience && (
                            <div className="team-info-item">
                              <Clock size={16} />
                              <span>{member.experience}</span>
                            </div>
                          )}
                          {member.education && (
                            <div className="team-info-item">
                              <Award size={16} />
                              <span>{member.education}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {member.achievements?.length > 0 && (
                        <div className="team-member-achievements">
                          {member.achievements.map((achievement, idx) => (
                            <span key={idx} className="team-achievement-tag">
                              {achievement}
                            </span>
                          ))}
                        </div>
                      )}
                      {member.specialization && (
                        <div className="team-member-specialization">
                          <strong>{member.specializationLabel || "О тренере"}:</strong>{" "}
                          {member.specialization}
                        </div>
                      )}
                      {member.features?.length > 0 && (
                        <div className="team-member-features">
                          {member.features.map((feature, idx) => (
                            <span key={idx} className="team-feature-tag">
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                      {(member.email || member.phone) && (
                        <div className="team-member-contacts">
                          {member.email && (
                            <div className="team-contact-item">
                              <Mail size={16} />
                              <span>{member.email}</span>
                            </div>
                          )}
                          {member.phone && (
                            <div className="team-contact-item">
                              <Phone size={16} />
                              <span>{member.phone}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
