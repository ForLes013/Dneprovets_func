import React from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Calendar, Users, Trophy, Target } from "lucide-react";
import image from "../../utils/DNV2.png";

const HistorySection = () => {
  const [ref, inView] = useInView({
    threshold: 0.2,
    triggerOnce: true,
    rootMargin: "-50px",
  });

  const features = [
    {
      icon: Calendar,
      title: "5 лет успешной работы",
      description: "С 2020 года готовим чемпионов",
    },
    {
      icon: Users,
      title: "10+ футболистов",
      description: "В академиях и спортивных школах",
    },
    {
      icon: Trophy,
      title: "15+ наград",
      description: "Победы на турнирах и соревнованиях",
    },
    {
      icon: Target,
      title: "Современный подход",
      description: "Инновационные методики тренировок",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  return (
    <section id="history" className="history-section">
      <div className="section-container">
        <motion.div
          ref={ref}
          className="history-content"
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={containerVariants}
        >
          <motion.div className="history-text" variants={itemVariants}>
            <motion.h2 className="section-title" variants={itemVariants}>
              Наша история
            </motion.h2>

            <motion.p className="history-description" variants={itemVariants}>
              Футбольная школа «Днепровец» основана в 2020 году Шигидиным
              Александром Александровичем. Название школы связано с его
              собственной футбольной биографией: Александр прошел становление
              как игрок в могилевском «Днепре» в Республике Беларусь.
            </motion.p>

            <motion.p className="history-description" variants={itemVariants}>
              Эти принципы легли в основу «Днепровца». Мы начали с небольшой
              группы игроков, которые просто хотели тренироваться и расти. За
              пять лет школа развилась в структуру с тремя локациями и более
              чем 100 учениками.
            </motion.p>

            <motion.div className="features-grid" variants={containerVariants}>
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  className="feature-card"
                  variants={itemVariants}
                >
                  <div className="feature-icon">
                    <feature.icon size={22} />
                  </div>
                  <div className="feature-content">
                    <h3 className="feature-title">{feature.title}</h3>
                    <p className="feature-desc">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div className="history-image" variants={itemVariants}>
            <div className="image-container">
              <div className="placeholder-image">
                <div className="image-content">
                  <img src={image} alt="Фото команды" loading="lazy" />
                </div>
              </div>

              <div className="image-decoration deco-1" />
              <div className="image-decoration deco-2" />
              <div className="image-decoration deco-3" />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default HistorySection;
