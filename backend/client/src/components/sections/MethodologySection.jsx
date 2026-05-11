import React from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import {
  Brain,
  Heart,
  Users,
  Target,
  Award,
  Clock,
  Zap,
  Star,
  TrendingUp,
  Shield,
} from "lucide-react";

const MethodologySection = () => {
  const [ref, inView] = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const principles = [
    {
      icon: Brain,
      title: "Интеллектуальное развитие",
      description:
        "Учим читать игру, принимать тактические решения, развиваем футбольное мышление",
      color: "#4169e1",
    },
    {
      icon: Heart,
      title: "Эмоциональный интеллект",
      description:
        "Развиваем лидерские качества, умение работать в команде и справляться с давлением",
      color: "#d4a574",
    },
    {
      icon: Users,
      title: "Индивидуальный подход",
      description:
        "Для каждого ребенка персональный подход и уровень сложности",
      color: "#22c55e",
    },
    {
      icon: Target,
      title: "Постановка целей",
      description:
        "Учим ставить реальные цели и системно двигаться к их достижению",
      color: "#8b5cf6",
    },
  ];

  const ageGroups = [
    {
      age: "4-6 лет",
      title: "Футбольная азбука",
      features: [
        "Обучение через игру",
        "Интерактивный метод выполнения упражнений с мячом",
        "Основы координации",
        "Развитие моторики",
      ],
      color: "#d4a574",
      icon: Star,
    },
    {
      age: "7-9 лет",
      title: "Техническая база",
      features: [
        "Техника владения мячом",
        "Основы индивидуальной тактики",
        "Развития быстроты и ловкости",
        "Простые взаимодействия в группах",
      ],
      color: "#4169e1",
      icon: Zap,
    },
    {
      age: "10-12 лет",
      title: "Тактическое мышление",
      features: [
        "Физическая подготовка",
        "Групповые и командные взаимодействия",
        "Игровое мышление",
        "Соревновательная практика",
      ],
      color: "#22c55e",
      icon: Brain,
    },
    {
      age: "13-14 лет",
      title: "Подготовка к большому полю",
      features: [
        "Специализация по амплуа",
        "Профориентация",
        "Участие в турнирах",
        "Подготовка к Академии",
      ],
      color: "#8b5cf6",
      icon: TrendingUp,
    },
  ];

  const stats = [
    { icon: Clock, value: "6", label: "тренировок в неделю", suffix: "" },
    {
      icon: Users,
      value: "1:8",
      label: "соотношение тренер/ученики",
      suffix: "",
    },
    {
      icon: Award,
      value: "90",
      label: "учеников продолжают карьеру",
      suffix: "%",
    },
    {
      icon: Shield,
      value: "100",
      label: "безопасность и качество",
      suffix: "%",
    },
  ];

  const methodologySteps = [
    {
      step: "01",
      title: "Диагностика",
      description: "Комплексная оценка физических и технических навыков",
      icon: Target,
    },
    {
      step: "02",
      title: "Планирование",
      description: "Разработка индивидуальной программы развития",
      icon: Brain,
    },
    {
      step: "03",
      title: "Тренировки",
      description: "Регулярные занятия по современным методикам",
      icon: Zap,
    },
    {
      step: "04",
      title: "Анализ",
      description: "Контроль прогресса и корректировка программы",
      icon: TrendingUp,
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  return (
    <section id="methodology" className="methodology-section">
      <div className="section-container">
        <motion.div
          ref={ref}
          className="methodology-content"
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={containerVariants}
        >
          {/* Заголовок */}
          <motion.div className="methodology-header" variants={itemVariants}>
            <h2 className="methodology-title">Методика обучения</h2>
            <p className="methodology-subtitle">
              Современный подход к подготовке футболистов, сочетающий
              техническое мастерство, тактическое мышление и психологическую
              подготовку
            </p>
          </motion.div>

          {/* Принципы обучения */}
          <motion.div className="principles-section" variants={itemVariants}>
            <h3 className="section-title">Наши принципы</h3>
            <div className="principles-grid">
              {principles.map((principle, index) => (
                <motion.div
                  key={index}
                  className="principle-card"
                  variants={cardVariants}
                  whileHover={{
                    scale: 1.05,
                    y: -10,
                    transition: { type: "spring", stiffness: 300 },
                  }}
                  style={{ "--accent-color": principle.color }}
                >
                  <div className="principle-icon-wrapper">
                    <div
                      className="principle-icon"
                      style={{ backgroundColor: principle.color }}
                    >
                      <principle.icon size={28} />
                    </div>
                  </div>
                  <h4 className="principle-title">{principle.title}</h4>
                  <p className="principle-description">
                    {principle.description}
                  </p>
                  <div className="principle-decoration"></div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Этапы методики */}
          <motion.div className="steps-section" variants={itemVariants}>
            <h3 className="section-title">Этапы развития</h3>
            <div className="steps-timeline">
              {methodologySteps.map((step, index) => (
                <motion.div
                  key={index}
                  className="step-card"
                  variants={cardVariants}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="step-header">
                    <div className="step-number">{step.step}</div>
                    <div className="step-icon">
                      <step.icon size={24} />
                    </div>
                  </div>
                  <h4 className="step-title">{step.title}</h4>
                  <p className="step-description">{step.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Возрастные группы */}
          <motion.div className="age-groups-section" variants={itemVariants}>
            <h3 className="section-title">Возрастные программы</h3>
            <div className="age-groups-grid">
              {ageGroups.map((group, index) => {
                const IconComponent = group.icon;
                return (
                  <motion.div
                    key={index}
                    className="age-group-card"
                    variants={cardVariants}
                    whileHover={{
                      scale: 1.02,
                      y: -5,
                      transition: { type: "spring", stiffness: 300 },
                    }}
                    style={{ "--accent-color": group.color }}
                  >
                    <div className="age-group-header">
                      <div
                        className="age-badge"
                        style={{ backgroundColor: group.color }}
                      >
                        {group.age}
                      </div>
                      <div className="age-icon">
                        <IconComponent size={24} />
                      </div>
                    </div>
                    <h4 className="group-title">{group.title}</h4>
                    <ul className="group-features">
                      {group.features.map((feature, idx) => (
                        <motion.li
                          key={idx}
                          className="feature-item"
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                        >
                          <div
                            className="feature-dot"
                            style={{ backgroundColor: group.color }}
                          ></div>
                          {feature}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Статистика */}
          <motion.div className="stats-section" variants={itemVariants}>
            <h3 className="section-title">Наши результаты</h3>
            <div className="stats-grid1">
              {stats.map((stat, index) => (
                <motion.div
                  key={index}
                  className="stat-card1"
                  variants={cardVariants}
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="stat-icon-wrapper1">
                    <stat.icon size={32} />
                  </div>
                  <div className="stat-value1">
                    {stat.value}
                    <span className="stat-suffix1">{stat.suffix}</span>
                  </div>
                  <div className="stat-label1">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA блок */}
          <motion.div className="methodology-cta" variants={itemVariants}>
            <div className="cta-content">
              <h3 className="cta-title">Готовы начать обучение?</h3>
              <p className="cta-description">
                Присоединяйтесь к нашей футбольной семье и откройте мир
                возможностей для вашего ребенка
              </p>
              <motion.a
                className="cta-button"
                href="#contacts"
                style={{ textDecoration: "none" }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Записаться на пробную тренировку
              </motion.a>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default MethodologySection;
