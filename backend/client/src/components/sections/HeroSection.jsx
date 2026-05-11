import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Clock, Users } from "lucide-react";

const backgroundSparks = [
  { className: "hero-spark hero-spark-gold hero-spark-1" },
  { className: "hero-spark hero-spark-blue hero-spark-2" },
  { className: "hero-spark hero-spark-gold hero-spark-3" },
  { className: "hero-spark hero-spark-blue hero-spark-4" },
  { className: "hero-spark hero-spark-gold hero-spark-5" },
  { className: "hero-spark hero-spark-blue hero-spark-6" },
];

const HeroSection = () => {
  return (
    <section className="hero-section">
      <div className="hero-background" aria-hidden="true">
        <div className="hero-spotlight hero-spotlight-left" />
        <div className="hero-spotlight hero-spotlight-right" />
        <div className="hero-ring hero-ring-gold" />
        <div className="hero-ring hero-ring-blue" />
        {backgroundSparks.map((spark) => (
          <span key={spark.className} className={spark.className} />
        ))}
        <div className="hero-grid" />
      </div>

      <div className="hero-container">
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1 }}
          >
            Футбольная школа
            <span className="title-emphasis"> «Днепровец»</span>
          </motion.h1>

          <motion.p
            className="hero-description"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 1 }}
          >
            Профессиональная подготовка юных футболистов с индивидуальным
            подходом. Современные методики тренировок и развитие спортивного
            потенциала.
          </motion.p>

          <motion.div
            className="hero-features"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 1 }}
          >
            <div className="feature">
              <MapPin className="feature-icon" />
              <div>
                <div className="feature-value">3 филиала</div>
                <div className="feature-label">в городе</div>
              </div>
            </div>
            <div className="feature">
              <Clock className="feature-icon" />
              <div>
                <div className="feature-value">5-16 лет</div>
                <div className="feature-label">возраст групп</div>
              </div>
            </div>
            <div className="feature">
              <Users className="feature-icon" />
              <div>
                <div className="feature-value">10+ тренеров</div>
                <div className="feature-label">опыт работы</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 1 }}
          >
            <a
              className="cta-button"
              style={{ textDecoration: "none" }}
              href="#contacts"
            >
              Записаться на пробную тренировку
              <ArrowRight className="button-icon" />
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          className="stats-sidebar"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <div className="stat-item">
            <div className="stat-number">500+</div>
            <div className="stat-label">учеников</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">50+</div>
            <div className="stat-label">наград</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">1000+</div>
            <div className="stat-label">тренировок</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
